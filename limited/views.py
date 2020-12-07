import datetime
import random
import typing as t

from distutils.util import strtobool
from json import JSONDecodeError

from django.db import transaction
from django.db.models import Prefetch, QuerySet
from django.contrib.auth import get_user_model

from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response

from mtgorp.models.formats.format import Format
from mtgorp.models.collections.deck import Deck
from mtgorp.models.serilization.serializeable import SerializationException
from mtgorp.models.serilization.strategies.jsonid import JsonId
from mtgorp.models.serilization.strategies.raw import RawStrategy
from mtgorp.tools.deckio import DeckSerializer
from mtgorp.tools.parsing.exceptions import ParseException
from mtgorp.tools.parsing.search.parse import SearchParser
from mtgorp.tools.search.extraction import PrintingStrategy
from mtgorp.tools.search.pattern import Pattern

from magiccube.tools.subset import check_deck_subset_pool
from magiccube.collections.cube import Cube

from api.serialization import orpserialize
from resources.staticdb import db
from limited import models, serializers


class PoolDetailPermissions(permissions.BasePermission):

    def has_permission(self, request, view):
        return True

    def has_object_permission(self, request: Request, view, obj: models.Pool):
        return obj.can_view(request.user)


class PoolDetailPermissionsWithCode(PoolDetailPermissions):

    def has_object_permission(self, request: Request, view, obj: models.Pool):
        code = request.query_params.get('code')
        return (
            models.PoolSharingCode.objects.filter(code = code, pool = obj).exists()
            or super().has_object_permission(request, view, obj)
        )


class DeckPermissions(permissions.BasePermission):

    def has_permission(self, request, view):
        return True

    def has_object_permission(self, request, view, obj: models.PoolDeck):
        return obj.can_view(request.user)


class DeckPermissionsWithCode(DeckPermissions):

    def has_object_permission(self, request: Request, view, obj: models.PoolDeck):
        code = request.query_params.get('code')
        return (
            models.PoolSharingCode.objects.filter(code = code, pool_id = obj.pool_id).exists()
            or super().has_object_permission(request, view, obj)
        )


class PoolDetail(generics.RetrieveDestroyAPIView):
    queryset = models.Pool.objects.all().select_related(
        'user',
    ).prefetch_related(
        'pool_decks',
    )
    permission_classes = [PoolDetailPermissionsWithCode]

    def get_serializer(self, *args, **kwargs):
        pool: models.Pool = args[0]
        serializer_class = (
            serializers.FullPoolSerializer
            if pool.pool_decks.exists() and (
                'code' in self.request.query_params and models.PoolSharingCode.objects.filter(
                    code = self.request.query_params['code'],
                    pool = pool,
                ).exists()
                or pool.pool_decks.order_by('created_at').last().can_view(self.request.user)
            ) else
            serializers.PoolSerializer
        )
        kwargs['context'] = self.get_serializer_context()
        return serializer_class(*args, **kwargs)

    def post(self, request: Request, *args, **kwargs) -> Response:
        try:
            pool = models.Pool.objects.select_related('session').get(id = kwargs['pk'], user = request.user)
        except models.Pool.DoesNotExist:
            return Response(status = status.HTTP_404_NOT_FOUND)

        allow_cheating = (
            pool.session.allow_cheating
            and not models.MatchPlayer.objects.filter(user = request.user, match_result__session = pool.session).exists()
        )

        if not (
            (
                pool.session.state == models.LimitedSession.LimitedSessionState.DECK_BUILDING
                or (
                    pool.session.state == models.LimitedSession.LimitedSessionState.PLAYING and
                    allow_cheating
                )
            )
            and (
                allow_cheating
                or not pool.session.open_decks
                or not pool.pool_decks.exists()
            )
        ):
            return Response(status = status.HTTP_405_METHOD_NOT_ALLOWED)

        try:
            deck = JsonId(db).deserialize(Deck, request.data.get('deck', '{}'))
        except (SerializationException, JSONDecodeError):
            return Response({'errors': ['invalid decks definition']}, status = status.HTTP_400_BAD_REQUEST)

        valid, errors = check_deck_subset_pool(
            pool.pool,
            deck.seventy_five,
            pool.session.infinites.cardboards,
            strict = False,
        )

        if not valid:
            return Response({'errors': errors}, status = status.HTTP_400_BAD_REQUEST)

        game_format = Format.formats_map.get(pool.session.format)

        if game_format is not None:
            valid, errors = game_format.deckcheck(deck)
            if not valid:
                return Response({'errors': errors}, status = status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            pool_deck = models.PoolDeck.objects.create(
                deck = deck,
                pool = pool,
                name = request.data.get('name', 'decks'),
                cheating = (
                    pool.session.state != models.LimitedSession.LimitedSessionState.DECK_BUILDING
                    or pool.session.open_decks and pool.pool_decks.exists()
                ),
            )

            if all(models.Pool.objects.filter(session = pool.session).values_list('pool_decks', flat = True)):
                pool.session.state = models.LimitedSession.LimitedSessionState.PLAYING
                pool.session.playing_at = datetime.datetime.now()
                pool.session.save(update_fields = ('state', 'playing_at'))

        return Response(
            serializers.PoolDeckSerializer(pool_deck, context = {'request': request}).data,
            status = status.HTTP_201_CREATED,
        )


class PoolExport(generics.GenericAPIView):
    queryset = models.Pool.objects.all()
    permission_classes = [PoolDetailPermissionsWithCode]

    def get(self, request: Request, *args, **kwargs) -> Response:
        return Response(
            status = status.HTTP_200_OK,
            content_type = 'application/text',
            data = JsonId.serialize(self.get_object().pool),
        )


class DeckDetail(generics.RetrieveAPIView):
    queryset = models.PoolDeck.objects.all()
    serializer_class = serializers.PoolDeckSerializer
    permission_classes = [DeckPermissionsWithCode]


class DeckList(generics.ListAPIView):
    queryset = models.PoolDeck.objects.filter(
        pool__session__state = models.LimitedSession.LimitedSessionState.FINISHED,
    ).select_related(
        'pool__user'
    ).prefetch_related(
        Prefetch(
            'pool__session',
            queryset = models.LimitedSession.objects.all().only(
                'id',
                'name',
                'state',
            )
        ),
    ).order_by(
        '-created_at',
    )
    serializer_class = serializers.FullPoolDeckSerializer

    filters: t.List[Pattern] = []

    def get_queryset(self):
        queryset = self.queryset
        if isinstance(queryset, QuerySet):
            queryset = queryset.all()

        if self.filters:
            queryset = queryset.filter(
                id__in = [
                    deck.id
                    for deck in
                    queryset
                    if all(
                        any(
                            filter_pattern.match(p)
                            for p in
                            deck.deck.seventy_five.distinct_elements()
                        )
                        for filter_pattern in
                        self.filters
                    )
                ]
            )

        return queryset

    def get(self, request, *args, **kwargs):
        if 'filter' in request.GET:
            self.filters = []
            search_parser = SearchParser(db)

            for filter_pattern in request.GET.getlist('filter', []):
                try:
                    self.filters.append(search_parser.parse(filter_pattern, PrintingStrategy))
                except ParseException as e:
                    return Response(str(e), status = status.HTTP_400_BAD_REQUEST)

        return super().get(request, *args, **kwargs)


class DeckExport(generics.GenericAPIView):
    queryset = models.PoolDeck.objects.all()
    permission_classes = [DeckPermissionsWithCode]

    def get(self, request: Request, *args, **kwargs) -> Response:
        try:
            serializer = DeckSerializer.extension_to_serializer[request.query_params.get('extension', 'dec')]
        except KeyError:
            return Response(
                data = 'Invalid extension',
                status = status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            status = status.HTTP_200_OK,
            content_type = 'application/octet-stream',
            data = serializer.serialize(self.get_object().pool_decks.order_by('created_at').last()),
        )


class SampleHand(generics.GenericAPIView):
    queryset = models.PoolDeck.objects.all()
    permission_classes = [DeckPermissionsWithCode]

    def get(self, request: Request, *args, **kwargs) -> Response:
        try:
            native = strtobool(self.request.query_params.get('native', 'False'))
        except ValueError:
            return Response(status = status.HTTP_400_BAD_REQUEST)

        return Response(
            status = status.HTTP_200_OK,
            data = (
                RawStrategy
                if native else
                orpserialize.CubeSerializer
            ).serialize(
                Cube(
                    random.sample(
                        list(self.get_object().deck.maindeck),
                        7,
                    )
                )
            )
        )


class SharePool(generics.GenericAPIView):
    queryset = models.Pool.objects.all()
    permission_classes = [PoolDetailPermissionsWithCode]

    def post(self, request: Request, *args, **kwargs) -> Response:
        return Response(
            status = status.HTTP_200_OK,
            data = {
                'code': models.PoolSharingCode.get_for_pool(self.get_object()).code,
            },
        )


class SessionList(generics.ListAPIView):
    serializer_class = serializers.LimitedSessionSerializer

    _allowed_sort_keys = {
        'name': 'name',
        'format': 'format',
        'game_type': 'game_type',
        'state': 'state',
        'created_at': 'created_at',
        'playing_at': 'playing_at',
        'finished_at': 'finished_at',
    }

    def get_queryset(self):
        queryset = models.LimitedSession.objects.all().prefetch_related(
            'pool_specification__specifications',
            Prefetch(
                'pool_specification__specifications__release',
                queryset = models.CubeRelease.objects.all().only(
                    'id',
                    'name',
                    'created_at',
                    'checksum',
                    'intended_size',
                    'versioned_cube_id',
                )
            ),
            Prefetch(
                'pools',
                queryset = models.Pool.objects.all().only(
                    'id',
                    'session_id',
                    'user_id',
                )
            ),
            'pools__user',
            'results',
            'results__players',
            'results__players__user',
        )
        name_filter = self.request.GET.get('name_filter')
        if name_filter:
            if not isinstance(name_filter, str):
                return Response(f'invalid name filter {name_filter}', status = status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(name__contains = name_filter)

        format_filter = self.request.GET.get('format_filter')
        if format_filter:
            try:
                game_format = Format.formats_map[format_filter]
            except KeyError:
                return Response(f'invalid format filter {format_filter}', status = status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(format = game_format.name)

        game_type_filter = self.request.GET.get('game_type_filter')
        if game_type_filter:
            queryset = queryset.filter(game_type = game_type_filter)

        state_filter = self.request.GET.getlist('state_filter')
        if state_filter:
            try:
                if isinstance(state_filter, list):
                    states = [models.LimitedSession.LimitedSessionState[_state] for _state in state_filter]
                else:
                    states = [models.LimitedSession.LimitedSessionState[state_filter]]
            except KeyError:
                return Response(f'invalid state filter {state_filter}', status = status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(
                **{
                    'state__in': states
                }
            )

        players_filter = self.request.GET.get('players_filter')
        if players_filter:
            if not isinstance(players_filter, str):
                return Response(f'invalid player filter {players_filter}', status = status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(pools__user__username = players_filter)

        sort_key = [self._allowed_sort_keys.get(self.request.GET.get('sort_key'), 'created_at')]
        ascending = strtobool(self.request.GET.get('ascending', 'false'))

        if sort_key[0] != self._allowed_sort_keys['created_at']:
            sort_key.append(self._allowed_sort_keys['created_at'])

        if not ascending:
            sort_key[0] = '-' + sort_key[0]

        return queryset.order_by(*sort_key)


class SessionDetail(generics.RetrieveDestroyAPIView):
    serializer_class = serializers.FullLimitedSessionSerializer
    queryset = models.LimitedSession.objects.all().prefetch_related(
        Prefetch('pools__pool_decks', queryset = models.PoolDeck.objects.all().only('id')),
        Prefetch('pools__user', queryset = get_user_model().objects.all().only('username')),
        'results',
        'results__players',
        Prefetch('results__players__user', queryset = get_user_model().objects.all().only('username')),
    )
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, ]


class SessionResultsPermission(permissions.BasePermission):

    def has_permission(self, request, view):
        return True

    def has_object_permission(self, request, view, obj: models.LimitedSession):
        return obj.pools.filter(user_id = request.user.id).exists()


class CompleteSession(generics.GenericAPIView):
    queryset = models.LimitedSession.objects.all()
    permission_classes = [SessionResultsPermission, ]

    def post(self, request: Request, *args, **kwargs) -> Response:
        session: models.LimitedSession = self.get_object()
        if not session.state == models.LimitedSession.LimitedSessionState.PLAYING:
            return Response(
                'Cannot complete limited session that is not playing',
                status = status.HTTP_400_BAD_REQUEST,
            )
        session.complete()
        return Response(status = status.HTTP_200_OK)


class SubmitResult(generics.GenericAPIView):
    queryset = models.LimitedSession.objects.all()
    permission_classes = [SessionResultsPermission, ]

    def post(self, request: Request, *args, **kwargs) -> Response:
        limited_session: models.LimitedSession = self.get_object()

        if not limited_session.state == models.LimitedSession.LimitedSessionState.PLAYING:
            return Response(
                'Session in invalid state for submitting results',
                status = status.HTTP_400_BAD_REQUEST,
            )

        serializer = serializers.MatchResultSerializer(data = request.data)
        serializer.is_valid(raise_exception = True)

        if not (
            serializer.validated_data['draws']
            + sum(player['wins'] for player in serializer.validated_data['players'])
        ):
            return Response(
                'At least one game must be completed',
                status = status.HTTP_400_BAD_REQUEST,
            )

        if len(serializer.validated_data['players']) <= 1:
            return Response(
                'Match result must include more than one player',
                status = status.HTTP_400_BAD_REQUEST,
            )

        user_ids = [player['user_id'] for player in serializer.validated_data['players']]
        user_id_set = set(user_ids)
        if (
            not len(user_ids) == len(user_id_set)
            or not user_id_set <= set(limited_session.pools.all().values_list('user_id', flat = True))
        ):
            return Response(
                'Invalid users',
                status = status.HTTP_400_BAD_REQUEST,
            )

        if any(
            user_id_set == set(_match_result.players.all().values_list('user_id', flat = True))
            for _match_result in
            models.MatchResult.objects.filter(session = limited_session).prefetch_related(
                Prefetch('players__user', queryset = get_user_model().objects.all().only('username')),
            )
        ):
            return Response(
                'Result already posted for this match',
                status = status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            match_result = models.MatchResult.objects.create(
                session = limited_session,
                draws = serializer.validated_data['draws']
            )
            for player in serializer.validated_data['players']:
                models.MatchPlayer.objects.create(
                    user_id = player['user_id'],
                    wins = player['wins'],
                    match_result = match_result,
                )
            if limited_session.results.all().count() >= limited_session.expected_match_amount:
                limited_session.complete()

        return Response(status = status.HTTP_200_OK)
