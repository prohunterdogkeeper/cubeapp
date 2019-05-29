
import typing as t

from abc import abstractmethod

import json

from rest_framework import serializers

from mtgorp.models.serilization.serializeable import compacted_model
from mtgorp.models.serilization.strategies.jsonid import JsonId
from mtgorp.models.persistent.printing import Printing
from mtgorp.models.persistent.expansion import Expansion

from magiccube.collections.cube import Cube
from magiccube.laps.tickets.ticket import Ticket
from magiccube.laps.purples.purple import Purple
from magiccube.laps.traps.trap import Trap
from magiccube.laps.traps.tree.printingtree import PrintingNode

from resources.staticdb import db


T = t.TypeVar('T')


class _Serializer(t.Generic[T]):

	@classmethod
	@abstractmethod
	def serialize(cls, serializeable: T) -> compacted_model:
		pass


class ExpansionSerializer(_Serializer[Expansion]):

	@classmethod
	def serialize(cls, expansion: Expansion) -> compacted_model:
		return {
			'code': expansion.code,
			'name': expansion.name,
			'block': None if expansion.block is None else expansion.block.name,
			'release_date': expansion.release_date,
		}


class PrintingSerializer(_Serializer[Printing]):

	@classmethod
	def serialize(cls, printing: Printing) -> compacted_model:
		return {
			'name': printing.cardboard.name,
			'expansion': ExpansionSerializer.serialize(printing.expansion),
			'id': printing.id,
			'color': [
				color.letter_code
				for color in
				printing.cardboard.front_card.color
			],
			'types': [
				_type.name
				for _type in
				printing.cardboard.front_card.type_line.types
			],
		}


class NodeSerializer(_Serializer):

	@classmethod
	def serialize(cls, printing_node: PrintingNode) -> compacted_model:
		return {
			'type': printing_node.__class__.__name__,
			'children': [
				PrintingSerializer.serialize(
					child
				) if isinstance(child, Printing) else
				NodeSerializer.serialize(
					child
				)
				for child in
				printing_node.children
			]
		}


class TrapSerializer(_Serializer[Trap]):

	@classmethod
	def serialize(cls, trap: Trap) -> compacted_model:
		return {
			'hash': trap.persistent_hash(),
			'node': NodeSerializer.serialize(trap.node),
			'intention_type': trap.intention_type.name,
		}


class TicketSerializer(_Serializer[Ticket]):

	@classmethod
	def serialize(cls, ticket: Ticket) -> compacted_model:
		return {
			'options': [
				PrintingSerializer.serialize(
					printing
				) for printing in
				ticket.options
			],
			'name': ticket.name,
			'hash': ticket.persistent_hash(),
		}


class PurpleSerializer(_Serializer[Purple]):

	@classmethod
	def serialize(cls, purple: Purple) -> compacted_model:
		return {
			'name': purple.name,
			'hash': purple.persistent_hash(),
			'description': purple.description,
		}


class CubeSerializer(_Serializer[Cube]):

	@classmethod
	def serialize(cls, cube: Cube) -> compacted_model:
		return {
			'printings': [
				PrintingSerializer.serialize(
					printing
				) for printing in
				cube.printings
			],
			'traps': [
				TrapSerializer.serialize(
					trap
				) for trap in
				cube.traps
			],
			'tickets': [
				TicketSerializer.serialize(
					ticket
				) for ticket in
				cube.tickets
			],
			'purples': [
				PurpleSerializer.serialize(
					purple
				) for purple in
				cube.purples
			],
		}


class JsonField(serializers.Field):

	def to_internal_value(self, data):
		return json.loads(data)
		# print(data)
		# return data

	def to_representation(self, value):
		return CubeSerializer.serialize(
			JsonId(db).deserialize(
				Cube,
				value
			)
		)


class CubeContainerSerializer(serializers.Serializer):
	id = serializers.IntegerField(read_only=True)
	created_at = serializers.DateTimeField(read_only=True)
	name = serializers.CharField(read_only=True)
	checksum = serializers.CharField(read_only=True)

	def update(self, instance, validated_data):
		pass

	def create(self, validated_data):
		pass


class FullCubeContainerSerializer(CubeContainerSerializer):
	cube_content = JsonField()