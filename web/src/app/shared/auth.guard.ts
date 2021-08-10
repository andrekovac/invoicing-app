import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { isLoggedIn } from '../../session.js';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private router: Router) { }

  canActivate(): boolean | UrlTree {
    return isLoggedIn() ? true : this.router.parseUrl('/login');
  }
}
