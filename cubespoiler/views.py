from django.shortcuts import render
from django.http import HttpResponse, HttpRequest, JsonResponse

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework import status

from mtgorp.models.persistent.printing import Printing

from magiccube.laps.traps.trap import Trap

from resources.staticdb import db
from resources.staticimageloader import image_loader
from cubespoiler.serializers import CubeContainerSerializer, FullCubeContainerSerializer
from cubespoiler import models


@api_view(['GET',])
def index(request: Request) -> Response:
	cubes = models.CubeContainer.objects.all()
	serializer = CubeContainerSerializer(cubes, many=True)
	return Response(serializer.data)


@api_view(['GET',])
def cube_view(request: Request, cube_id: int) -> Response:
	try:
		cube_container = models.CubeContainer.objects.get(pk=cube_id)
	except models.CubeContainer.DoesNotExist:
		return Response(status=status.HTTP_404_NOT_FOUND)

	if request.method == 'GET':
		serializer = FullCubeContainerSerializer(cube_container)
		return Response(serializer.data)


_IMAGE_TYPES_MAP = {
	'printing': Printing,
	'trap': Trap,
}

def image_view(request: HttpRequest, pictured_id: str) -> HttpResponse:
	if not request.method == 'GET':
		return HttpResponse(status=status.HTTP_405_METHOD_NOT_ALLOWED)

	pictured_type = _IMAGE_TYPES_MAP.get(request.GET.get('type', 'printing'), Printing)

	if pictured_type == Trap:
		image = image_loader.get_image(picture_name=pictured_id, pictured_type=pictured_type)
	else:
		try:
			_id = int(pictured_id)
		except ValueError:
			return HttpResponse(status=status.HTTP_400_BAD_REQUEST)
		image = image_loader.get_image(db.printings[_id])


	response = HttpResponse(content_type='image/png')
	image.get().save(response, 'PNG')
	return response


def test(request: HttpRequest) -> HttpResponse:
	cardboard = db.cardboards['Fire // Ice']
	return HttpResponse(f'Hm: "{cardboard.name}"')