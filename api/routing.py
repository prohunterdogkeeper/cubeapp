from django.urls import path

from api import consumers


websocket_urlpatterns = [
    path('ws/distribute/', consumers.DistributorConsumer),
]