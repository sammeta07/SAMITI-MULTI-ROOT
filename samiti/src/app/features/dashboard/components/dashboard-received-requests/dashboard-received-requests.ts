import { Component, inject, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { RouterModule, RouterOutlet } from "@angular/router";
import { Router, ActivatedRoute } from "@angular/router";

@Component({
  selector: "app-dashboard-received-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    RouterModule,
    RouterOutlet,
  ],
  templateUrl: "./dashboard-received-requests.html",
  styleUrls: ["./dashboard-received-requests.scss"],
})
export class DashboardReceivedRequestsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  selectedTab = signal(0);

  readonly tabRoutes = [
    'committee-admin-requests',
    'committee-member-requests',
    'membership-requests-history'
  ];

  ngOnInit(): void {
    this.route.url.subscribe((segments) => {
      const path = segments[0]?.path || '';
      const index = this.tabRoutes.indexOf(path);
      if (index >= 0) {
        this.selectedTab.set(index);
      }
    });
  }

  onTabClick(index: number): void {
    const route = this.tabRoutes[index];
    if (this.selectedTab() !== index) {
      this.selectedTab.set(index);
    }
    this.router.navigate([route], { relativeTo: this.route });
  }
}
