from django.urls import path
from . import views
from .models import *

urlpatterns = [
    path('', views.index),
    path('register/user', views.registerUser),
    path('login', views.login),
    path('main', views.main),
]