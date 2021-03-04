from django.shortcuts import render, redirect
import bcrypt
from django.contrib import messages
from .models import *
import yfinance as yf


def index(request):
    if 'user_id' in request.session:
        this_user = request.session['user_id']
        user_positions = Position.objects.filter(owned_by=User.objects.get(id=this_user))
        
        context = {
            'logged_user': User.objects.get(id=request.session['user_id']),
            'positions': user_positions,
        }
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
    this_user = User.objects.create(
        first_name=request.POST['first_name'], last_name=request.POST['last_name'], email=request.POST['email'], password=pw_hash)
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
    # Add code to handle the transaction of buying a stock
    pass

def sell_stock(request):
    # Add code to handle the transaction of selling a stock
    pass

def addMoney(request, id):
    #Add code to handle adding to account  
    pass

def search (request):
    pass
    if 'user_id' in request.session:
        current_search = yf.Ticker(request.POST['search'])
        current_info = current_search.info
        print(current_info['ask'])
        return redirect("/userpage.html")


# Take the selling price and subtract the initial purchase price. The result is the gain or loss.
# Take the gain or loss from the investment and divide it by the original amount or purchase price of the investment.
# Finally, multiply the result by 100 to arrive at the percentage change in the investment.
