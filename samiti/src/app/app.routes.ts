import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { 
    path: 'home', 
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) 
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
      },
      {
        path: 'requests',
        loadComponent: () => import('./features/dashboard/components/dashboard-requests/dashboard-requests').then(m => m.DashboardRequestsComponent)
      },
      {
        path: 'group/:id',
        loadComponent: () => import('./features/dashboard/components/group-details/group-details').then(m => m.GroupDetailsComponent)
      },
      {
        path: 'event/:id',
        loadComponent: () => import('./features/dashboard/components/event-details/event-details').then(m => m.EventDetailsComponent)
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      }
    ]
  },

  { path: '**', redirectTo: 'home' }
];