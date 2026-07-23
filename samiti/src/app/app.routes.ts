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
        children: [
          {
            path: 'sent',
            loadComponent: () => import('./features/dashboard/components/dashboard-sent-requests/dashboard-sent-requests').then(m => m.DashboardSentRequestsComponent)
          },
          {
            path: 'received',
            loadComponent: () => import('./features/dashboard/components/dashboard-received-requests/dashboard-received-requests').then(m => m.DashboardReceivedRequestsComponent),
            children: [
              {
                path: 'committee-admin-requests',
                loadComponent: () => import('./features/dashboard/components/dashboard-received-requests/committee-admin-requests/committee-admin-requests.component').then(m => m.CommitteeAdminRequestsComponent)
              },
              {
                path: 'committee-member-requests',
                loadComponent: () => import('./features/dashboard/components/dashboard-received-requests/committee-member-requests/committee-member-requests.component').then(m => m.CommitteeMemberRequestsComponent)
              },
              {
                path: 'membership-requests-history',
                loadComponent: () => import('./features/dashboard/components/dashboard-received-requests/membership-requests-history/membership-requests-history.component').then(m => m.MembershipRequestsHistoryComponent)
              },
              {
                path: '',
                redirectTo: 'committee-admin-requests',
                pathMatch: 'full'
              }
            ]
          },
          {
            path: '',
            redirectTo: 'received',
            pathMatch: 'full'
          }
        ]
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
        path: 'program/:id',
        loadComponent: () => import('./features/dashboard/components/program-details/program-details').then(m => m.ProgramDetailsComponent)
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