import { Component, inject, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { RouterModule, RouterOutlet } from "@angular/router";
import { Router, ActivatedRoute, NavigationEnd, NavigationCancel, NavigationError } from "@angular/router";
import { filter } from "rxjs";

@Component({
  selector: "app-dashboard-sent-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTabsModule,
    RouterModule,
    RouterOutlet,
  ],
  templateUrl: "./dashboard-sent-requests.html",
  styleUrls: ["./dashboard-sent-requests.scss"],
})
export class DashboardSentRequestsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  selectedTabIndex = 0;

  readonly tabRoutes = [
    'admin-requests',
    'member-requests',
    'history'
  ];

  ngOnInit(): void {
    this.syncTabFromUrl();

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError)
    ).subscribe(() => {
      this.syncTabFromUrl();
    });
  }

  private syncTabFromUrl(): void {
    const root = this.route.root;
    let current: ActivatedRoute | null = root;
    while (current) {
      if (current.firstChild) {
        current = current.firstChild;
      } else {
        break;
      }
    }

    const segments = current?.snapshot.url || [];
    const segmentPath = segments[0]?.path || '';
    const index = this.tabRoutes.indexOf(segmentPath);
    if (index >= 0) {
      this.selectedTabIndex = index;
    }
  }

  onTabChange(index: number): void {
    const route = this.tabRoutes[index];
    this.selectedTabIndex = index;
    this.router.navigate([route], { relativeTo: this.route });
  }
}
