from django.urls import path, include, re_path


urlpatterns = [
    path('api/', include('api.urls')),
    path('api/auth/', include('knox.urls')),
    path('api/limited/', include('limited.urls')),
    path('api/draft/', include('draft.urls')),
    path('api/wishlist/', include('wishlist.urls')),
    re_path('.*', include('frontend.urls')),
]
