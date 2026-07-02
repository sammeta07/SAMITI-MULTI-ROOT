import { Component, inject, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { NotifierComponent } from './shared/notifier/notifier.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, NotifierComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {}
}
