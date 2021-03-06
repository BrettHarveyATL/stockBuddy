from django.shortcuts import render, redirect
import bcrypt
from django.contrib import messages
from .models import *
import yfinance as yf
from django.core import serializers
import json


def index(request):
    if 'user_id' in request.session:
        this_user = User.objects.get(id=request.session['user_id'])
        user_positions = Position.objects.filter(owned_by=this_user)
        context = {
            'logged_user': this_user,
            'positions': user_positions,
        }
        msft = yf.Ticker("MSFT")
        print(msft.financials)

        return render(request, "userpage.html", context)
    return render(request, "index.html")


def registerUser(request):
    errors = User.objects.basic_validator(request.POST)
    if errors:
        for key, value in errors.items():
            messages.error(request, value)
        return redirect('/')
    password = request.POST['password']
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    this_user = User.objects.create(first_name=request.POST['first_name'], last_name=request.POST['last_name'], balance=0, email=request.POST['email'], password=pw_hash)
    request.session['user_id'] = this_user.id
    return redirect('/')


def login(request):
    user = User.objects.filter(email=request.POST['email'])
    if user:
        logged_user = user[0]
        if bcrypt.checkpw(request.POST['password'].encode(), logged_user.password.encode()):
            request.session['user_id'] = logged_user.id
            return redirect('/')
    messages.error(request, "Invalid login")
    return redirect("/")


def logout(request):
    del request.session['user_id']
    return redirect('/')

def buy_stock(request):
    if 'user_id' in request.session:
        this_user = User.objects.get(id=request.session['user_id'])
        this_stock = yf.Ticker(request.POST['stock']).info
        Position.objects.create(stock=request.POST['stock'], num_shares=request.POST['num_shares'], bought_at=float(request.POST['bought_at']), owned_by=User.objects.get(id=this_user.id))
        this_user.balance -= round(float(request.POST['num_shares'])*float(this_stock['ask']),2)
        this_user.save()
        return redirect('/')
def sell_stock(request):
    # Add code to handle the transaction of selling a stock
    if 'user_id' in request.session:
        this_user = User.objects.get(id=request.session['user_id'])
        this_position = Position.objects.get(id=request.POST['position'])
        this_user.balance += round(float(this_position.num_shares)*float(request.POST['selling_at']),2)
        this_user.save()
        this_position.delete()
        return redirect('/')
        
def addMoney(request, id):
    if 'user_id' in request.session:
        this_user = User.objects.get(id=id)
        if this_user.balance < 0:
            this_user.balance = 0
            this_user.save()
            return redirect('/')
        else:
            this_user.balance += round(float(request.POST['amount']),2)
            this_user.save()
            return redirect('/')

def search (request):
    if 'user_id' in request.session:
        current_search = yf.Ticker(request.POST['search'])
        current_info = current_search.info
        context = {
            'stock': current_info,
            'logged_user': User.objects.get(id=request.session['user_id']),
        }
        return render(request, 'searchresults.html', context)

def seePosition(request, id):
    if 'user_id' in request.session:
        this_user = User.objects.get(id=request.session['user_id'])
        this_position = Position.objects.get(id=id)
        position_info = yf.Ticker(this_position.stock).info
        profLoss = round(((position_info['regularMarketPrice'] - this_position.bought_at)/this_position.bought_at), 2 ) * 100
        context = {
            'logged_user': this_user,
            'pos': this_position,
            'stock': position_info,
            'pL': profLoss,
        }
        return render(request, 'position.html', context)