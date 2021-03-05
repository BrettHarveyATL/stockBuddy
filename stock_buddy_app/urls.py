from django.urls import path
from . import views
from .models import *

urlpatterns = [
    path('', views.index),
    path('register/user', views.registerUser),
    path('login', views.login),
    path('logout', views.logout),
    path('addmoney/<int:id>', views.addMoney),
    path('search', views.search),
    path('sellstock', views.sell_stock),
    path('buystock', views.buy_stock),
]