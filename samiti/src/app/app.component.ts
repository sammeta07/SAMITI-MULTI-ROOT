import { Component, inject, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { NotifierComponent } from './shared/notifier/notifier.component';
import { HeaderService } from './components/header/header.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, NotifierComponent, MatIconModule, MatButtonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private readonly headerService = inject(HeaderService);

  readonly isGeolocationDenied = this.headerService.isGeolocationDenied;
  readonly isGeolocationChecking = this.headerService.isGeolocationChecking;

  ngOnInit() {}

  reloadPage(): void {
    window.location.reload();
  }
}
