import typing as t

import threading
import queue

from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from django.contrib.auth import get_user_model
from django.db import transaction, IntegrityError
from knox.auth import TokenAuthentication

from evolution import model

from mtgorp.models.serilization.strategies.jsonid import JsonId
from mtgorp.models.serilization.strategies.raw import RawStrategy

from magiccube.collections.cube import Cube
from magiccube.collections.laps import TrapCollection
from magiccube.collections.meta import MetaCube
from magiccube.collections.nodecollection import NodeCollection, GroupMap
from magiccube.laps.traps.distribute import algorithm
from magiccube.laps.traps.distribute.algorithm import Distributor, TrapDistribution
from magiccube.update import cubeupdate
from magiccube.update.cubeupdate import CubePatch, CubeUpdater
from magiccube.update.report import UpdateReport

from api import models
from api.serialization import orpserialize, serializers
from api import tasks
from api.services import DISTRIBUTOR_SERVICE, DistributionTask

from resources.staticdb import db


class QueueConsumer(threading.Thread):

    def __init__(
        self,
        q: queue.Queue,
        callback: t.Callable[[t.Dict[str, t.Any]], None],
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._q = q
        self._callback = callback
        self._terminating = threading.Event()

    def stop(self) -> None:
        self._terminating.set()

    def run(self) -> None:
        while not self._terminating.is_set():
            try:
                self._callback(
                    self._q.get(timeout = 5)
                )
            except queue.Empty:
                pass


class MessageConsumer(JsonWebsocketConsumer):

    def _send_message(self, message_type: str, **kwargs):
        d = {'type': message_type}
        d.update(kwargs)
        self.send_json(d)

    def _send_error(self, message: t.Any):
        self.send_json(
            {
                'type': 'error',
                'message': message,
            }
        )


class DistributorConsumer(MessageConsumer):
    _value_value_map = {
        key: value
        for key, value in
        {
            0: 0,
            1: 1,
            2: 5,
            3: 15,
            4: 30,
            5: 55,
        }.items()
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._patch_pk: t.Optional[int] = None
        self._group_name: t.Optional[str] = None
        self._token: t.Optional[t.ByteString] = None

        self._distribution_task: t.Optional[DistributionTask] = None
        self._consumer: t.Optional[QueueConsumer] = None

        self._patch: t.Optional[models.CubePatch] = None
        self._versioned_cube: t.Optional[models.VersionedCube] = None
        self._updater: t.Optional[CubeUpdater] = None

    def connect(self):
        self._patch_pk = int(self.scope['url_route']['kwargs']['pk'])
        self._group_name = f'distributor_{self._patch_pk}'
        self.accept()

    def disconnect(self, code):
        if self._distribution_task is not None:
            self._distribution_task.unsubscribe(
                str(
                    id(
                        self
                    )
                )
            )
            self._consumer.stop()
        if self._group_name is not None:
            async_to_sync(self.channel_layer.group_discard)(
                self._group_name,
                self.channel_name,
            )

    def _get_distributor(self) -> Distributor:
        constrained_nodes = self._updater.new_nodes

        for node in constrained_nodes.nodes.distinct_elements():
            node._value = self._value_value_map.get(node._value, node._value)

        max_node_weight = max(node.value for node in constrained_nodes)

        for node in constrained_nodes.nodes.distinct_elements():
            node._value /= max_node_weight  # TODO fix

        distribution_nodes = list(map(algorithm.DistributionNode, constrained_nodes))

        group_map = self._updater.new_groups.normalized()

        trap_amount = self._updater.new_garbage_trap_amount

        constraint_set = model.ConstraintSet(
            (
                (
                    algorithm.SizeHomogeneityConstraint(
                        distribution_nodes,
                        trap_amount,
                    ),
                    1,
                ),
                (
                    algorithm.ValueDistributionHomogeneityConstraint(
                        distribution_nodes,
                        trap_amount,
                    ),
                    2,
                ),
                (
                    algorithm.GroupExclusivityConstraint(
                        distribution_nodes,
                        trap_amount,
                        group_map.groups,
                    ),
                    2,
                ),
            )
        )

        return Distributor(
            nodes = constrained_nodes,
            trap_amount = trap_amount,
            initial_population_size = 300,
            constraints = constraint_set,
        )

    def _connect_distributor(self) -> None:
        self._distribution_task = DISTRIBUTOR_SERVICE.connect(self._patch_pk)

        self._consumer = QueueConsumer(
            self._distribution_task.subscribe(
                str(
                    id(
                        self
                    )
                )
            ),
            self.send_json,
            daemon = True,
        )
        self._consumer.start()

    def _on_user_authenticated(self, auth_token: t.AnyStr, user: get_user_model()) -> None:
        self._token = auth_token
        self.scope['user'] = user
        async_to_sync(self.channel_layer.group_add)(
            self._group_name,
            self.channel_name,
        )
        self._send_message('authentication', state = 'success')

        try:
            self._patch = models.CubePatch.objects.get(pk = self._patch_pk)
        except models.CubePatch.DoesNotExist:
            self._send_error(f'no patch with id {self._patch_pk}')
            self.close()
            return

        self._versioned_cube = self._patch.versioned_cube
        latest_release = self._versioned_cube.latest_release

        cube_patch = JsonId(db).deserialize(CubePatch, self._patch.content)

        current_cube = JsonId(db).deserialize(
            Cube,
            latest_release.cube_content,
        )

        current_constrained_nodes = JsonId(db).deserialize(
            NodeCollection,
            latest_release.constrained_nodes.constrained_nodes_content,
        )

        current_group_map = JsonId(db).deserialize(
            GroupMap,
            latest_release.constrained_nodes.group_map_content,
        )

        meta_cube = MetaCube(
            cube = current_cube,
            nodes = current_constrained_nodes,
            groups = current_group_map,
        )

        self._updater = CubeUpdater(
            meta_cube = meta_cube,
            patch = cube_patch,
        )

        self.send_json(
            {
                'type': 'items',
                'patch': serializers.CubePatchSerializer(self._patch).data,
                'verbose_patch': orpserialize.VerbosePatchSerializer.serialize(
                    cube_patch.as_verbose(
                        meta_cube
                    )
                ),
                'preview': {
                    'cube': orpserialize.CubeSerializer.serialize(
                        current_cube + cube_patch.cube_delta_operation
                    ),
                    'nodes': {
                        'constrained_nodes_content': orpserialize.ConstrainedNodesOrpSerializer.serialize(
                            (
                                current_constrained_nodes + cube_patch.node_delta_operation
                                if hasattr(latest_release, 'constrained_nodes') else
                                NodeCollection(())
                            )
                        )
                    },
                    'group_map': orpserialize.GroupMapSerializer.serialize(
                        current_group_map + cube_patch.group_map_delta_operation
                    ),
                },
                'distributions': [
                    serializers.DistributionPossibilitySerializer(distribution).data
                    for distribution in
                    models.DistributionPossibility.objects.filter(
                        patch = self._patch,
                        patch_checksum = cube_patch.persistent_hash(),
                    ).order_by('-created_at')
                ],
                'report': orpserialize.UpdateReportSerializer.serialize(
                    UpdateReport(
                        CubeUpdater(meta_cube, cube_patch)
                    )
                ),
            }
        )

        self._connect_distributor()

    def receive_json(self, content, **kwargs):
        print('recv', content)

        message_type = content.get('type')

        if message_type is None:
            self._send_error('No Message type')
            return

        if message_type == 'authentication':
            knox_auth = TokenAuthentication()

            if not isinstance(content['token'], str):
                self._send_message('authentication', state = 'failure', reason = 'invalid token field')

            else:
                user, auth_token = knox_auth.authenticate_credentials(content['token'].encode('UTF-8'))
                if user is not None:
                    self._on_user_authenticated(auth_token, user)
                else:
                    self._send_message('authentication', state = 'failure', reason = 'invalid token')
            return

        if self._token is None:
            self._send_error('not logged in')
            return

        if message_type == 'start':
            if not self._distribution_task.is_working:
                self._distribution_task.submit(
                    self._get_distributor()
                )
            else:
                self._send_error('Distributor is busy, stop it before restarting')

        elif message_type == 'pause':
            if not (self._distribution_task and self._distribution_task.is_alive()):
                self._send_message('status', status = 'stopped')
                return
            self._distribution_task.pause()

        elif message_type == 'resume':
            if not (self._distribution_task and self._distribution_task.is_alive()):
                self._send_message('status', status = 'stopped')
                return
            self._distribution_task.resume()

        elif message_type == 'stop':
            if not (self._distribution_task and self._distribution_task.is_alive()):
                self._send_message('status', status = 'stopped')
                return
            self._distribution_task.cancel()

        elif message_type == 'capture':
            if not self._distribution_task.status == 'paused':
                self._send_error('Distributor must be paused to generate trap images')
                return

            try:
                trap_collection = self._distribution_task.get_latest_fittest().as_trap_collection()
            except TrapDistribution.InvalidDistribution:
                self._send_error('Distribution is invalid')
                return

            try:
                possibility = models.DistributionPossibility.objects.create(
                    patch_id = self._patch_pk,
                    content = JsonId(db).serialize(trap_collection),
                    patch_checksum = self._updater.patch.persistent_hash(),
                    fitness = self._distribution_task.get_latest_fittest().fitness[0],
                )
            except IntegrityError:
                self._send_error('Distribution already captured')
                return

            async_to_sync(self.channel_layer.group_send)(
                self._group_name,
                {
                    'type': 'distribution_possibility',
                    'content': serializers.DistributionPossibilitySerializer(possibility).data,
                },
            )

            tasks.generate_distribution_pdf.delay(
                self._patch_pk,
                possibility.id,
            )

        elif message_type == 'apply':
            possibility_id = content.get('possibility_id')

            with transaction.atomic():
                if possibility_id is not None:
                    try:
                        possibility = JsonId(db).deserialize(
                            TrapCollection,
                            models.DistributionPossibility.objects.filter(
                                pk = possibility_id,
                                patch_id = self._patch_pk,
                            ).select_for_update().get().content,
                        )
                    except models.DistributionPossibility.DoesNotExist:
                        self._send_error('Invalid possibility id')
                        return
                else:
                    possibility = None

                finale_cube = self._updater.get_finale_cube(possibility)

                new_release = models.CubeRelease.create(
                    cube = finale_cube,
                    versioned_cube = self._versioned_cube,
                )

                models.ConstrainedNodes.objects.create(
                    constrained_nodes_content = JsonId.serialize(
                        self._updater.new_nodes
                    ),
                    group_map_content = JsonId.serialize(
                        self._updater.new_groups
                    ),
                    release = new_release,
                )

                self._patch.delete()

                async_to_sync(self.channel_layer.group_send)(
                    self._group_name,
                    {
                        'type': 'update_success',
                        'new_release': new_release.id,
                    },
                )

                tasks.generate_release_lap_images.delay(
                    new_release.id,
                )

        else:
            self._send_error(f'Unknown message type "{message_type}"')

    def distribution_pdf_update(self, event):
        self.send_json(
            {
                'type': 'distribution_pdf',
                'url': event['url'],
                'possibility_id': event['possibility_id'],
            }
        )

    def distribution_possibility(self, event) -> None:
        self.send_json(
            {
                'type': 'distribution_possibility',
                'content': event['content']
            }
        )

    def update_success(self, event) -> None:
        self.send_json(
            {
                'type': 'update_success',
                'new_release': event['new_release'],
            }
        )


class PatchEditConsumer(MessageConsumer):
    _undo_map: t.Dict[str, t.Type[cubeupdate.CubeChange]] = {
        klass.__name__: klass
        for klass in
        (
            cubeupdate.AddGroup,
            cubeupdate.RemoveGroup,
            cubeupdate.GroupWeightChange,
            cubeupdate.NewCubeable,
            cubeupdate.RemovedCubeable,
            cubeupdate.NewNode,
            cubeupdate.RemovedNode,
            cubeupdate.PrintingsToNode,
            cubeupdate.NodeToPrintings,
            cubeupdate.TrapToNode,
            cubeupdate.NodeToTrap,
            cubeupdate.AlteredNode,
        )
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._patch_pk: t.Optional[int] = None
        self._group_name: t.Optional[str] = None
        self._token: t.Optional[t.ByteString] = None

    def _set_locked(self, locked: bool) -> None:
        self._send_message('status', status = 'locked' if locked else 'unlocked')

    def connect(self) -> None:
        self._patch_pk = int(self.scope['url_route']['kwargs']['pk'])
        self._group_name = f'patch_edit_{self._patch_pk}'

        self.accept()

    def receive_json(self, content, **kwargs):
        print('edit', content)

        message_type = content.get('type')

        if message_type is None:
            self._send_error('No Message type')
            return

        if message_type == 'authentication':
            knox_auth = TokenAuthentication()
            if not isinstance(content['token'], str):
                self._send_message('authentication', state = 'failure', reason = 'invalid token field')
            else:
                user, auth_token = knox_auth.authenticate_credentials(content['token'].encode('UTF-8'))
                if user is not None:
                    self._token = auth_token
                    self.scope['user'] = user
                    self._send_message('authentication', state = 'success')
                    if DISTRIBUTOR_SERVICE.is_patch_locked(self._patch_pk):
                        self._set_locked(True)
                    async_to_sync(self.channel_layer.group_add)(
                        self._group_name,
                        self.channel_name,
                    )
                    async_to_sync(self.channel_layer.group_send)(
                        self._group_name,
                        {
                            'type': 'user_update',
                            'action': 'enter',
                            'user': self.scope['user'].username,
                        },
                    )
                else:
                    self._send_message('authentication', state = 'failure', reason = 'invalid token')
            return

        if self._token is None:
            self._send_error('not logged in')
            return

        if message_type == 'update':

            if DISTRIBUTOR_SERVICE.is_patch_locked(self._patch_pk):
                self._send_message('status', status = 'locked')
                return

            with transaction.atomic():
                try:
                    patch = (
                        models.CubePatch.objects
                            .select_for_update()
                            .get(pk = self._patch_pk)
                    )
                except models.CubePatch.DoesNotExist:
                    self._send_error(f'no patch with id {self._patch_pk}')
                    self.close()
                    return

                update = content.get('update')
                change_undoes = content.get('change_undoes')

                if not update and not change_undoes:
                    self._send_error('update must have at least one of "updates" or "change_undoes" fields')
                    return

                current_patch = JsonId(db).deserialize(
                    CubePatch,
                    patch.content,
                )

                if update:
                    try:
                        update = RawStrategy(db).deserialize(
                            CubePatch,
                            update,
                        )
                    except (KeyError, AttributeError):
                        self._send_error('bad request')
                        return

                    current_patch += update

                if change_undoes:

                    undoes: t.List[t.Tuple[cubeupdate.CubeChange, int]] = []
                    try:
                        for undo, multiplicity in change_undoes:
                            undoes.append(
                                (
                                    JsonId(db).deserialize(
                                        self._undo_map[undo['type']],
                                        undo['content'],
                                    ),
                                    multiplicity,
                                )
                            )
                    except (KeyError, TypeError, ValueError):
                        self._send_error('bad request')
                        return

                    for undo, multiplicity in undoes:
                        current_patch -= (undo.as_patch() * multiplicity)

                patch.content = JsonId.serialize(
                    current_patch,
                )

                patch.save()

                latest_release = patch.versioned_cube.latest_release

                current_cube = JsonId(db).deserialize(
                    Cube,
                    latest_release.cube_content,
                )

                current_constrained_nodes = JsonId(db).deserialize(
                    NodeCollection,
                    latest_release.constrained_nodes.constrained_nodes_content,
                )

                current_group_map = JsonId(db).deserialize(
                    GroupMap,
                    latest_release.constrained_nodes.group_map_content,
                )

                msg = {
                    'type': 'cube_update',
                    'update': {
                        'patch': orpserialize.CubePatchOrpSerializer.serialize(
                            current_patch
                        ),
                        'verbose_patch': orpserialize.VerbosePatchSerializer.serialize(
                            current_patch.as_verbose(
                                MetaCube(
                                    cube = current_cube,
                                    nodes = current_constrained_nodes,
                                    groups = current_group_map,
                                )
                            )
                        ),
                        'preview': {
                            'cube': orpserialize.CubeSerializer.serialize(
                                current_cube + current_patch.cube_delta_operation
                            ),
                            'nodes': {
                                'constrained_nodes_content': orpserialize.ConstrainedNodesOrpSerializer.serialize(
                                    (
                                        current_constrained_nodes + current_patch.node_delta_operation
                                        if hasattr(latest_release, 'constrained_nodes') else
                                        NodeCollection(())
                                    )
                                )
                            },
                            'group_map': orpserialize.GroupMapSerializer.serialize(
                                current_group_map + current_patch.group_map_delta_operation
                            ),
                        },
                    },
                }

                async_to_sync(self.channel_layer.group_send)(
                    self._group_name,
                    msg,
                )

    def cube_update(self, event):
        self.send_json(
            {
                'type': 'update',
                'content': event['update']
            }
        )

    def user_update(self, event):
        action = event['action']
        user = event['user']
        if action == 'enter' and user != self.scope['user'].username:
            async_to_sync(self.channel_layer.group_send)(
                self._group_name,
                {
                    'type': 'user_update',
                    'action': 'here',
                    'user': self.scope['user'].username,
                },
            )

        self.send_json(
            {
                'type': 'user_update',
                'user': event['user'],
                'action': event['action'],
            }
        )

    def patch_lock(self, event):
        self._set_locked(event['action'] == 'acquirer')

    def disconnect(self, code):
        if self._token is not None:
            async_to_sync(self.channel_layer.group_send)(
                self._group_name,
                {
                    'type': 'user_update',
                    'action': 'leave',
                    'user': self.scope['user'].username,
                },
            )
        async_to_sync(self.channel_layer.group_discard)(
            self._group_name,
            self.channel_name,
        )
