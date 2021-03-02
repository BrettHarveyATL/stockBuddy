from django.shortcuts import render, redirect
import bcrypt
from django.contrib import messages
from .models import *

def index(request):
    return render(request, "index.html")

def registerUser(request):
    errors = User.objects.basic_validator(request.POST)
    if errors:
        for key, value in errors.items():
            messages.error(request, value)
        return redirect('/')
    password = request.POST['password']
    pw_hash= bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    this_user = User.objects.create(first_name= request.POST['first_name'], last_name= request.POST['last_name'], email= request.POST['email'], password=pw_hash)
    request.session['user_id'] = this_user.id
    return redirect('/main')

def login(request):
    user= User.objects.filter(email = request.POST['email'])
    if user:
        logged_user = user[0]
        if bcrypt.checkpw(request.POST['password'].encode(), logged_user.password.encode()):
            request.session['user_id'] = logged_user.id
            return redirect('/main')
    messages.error(request,"Invalid login")
    return redirect("/")

def main(request):
    if "user_id" not in request.session:
        return redirect("/")
    context = {
        "user" : User.objects.get(id=request.session['user_id'])
    }
    return render(request, "main.html",context)