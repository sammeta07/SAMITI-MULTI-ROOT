import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { LocationCoords } from './header.models';

@Injectable({ providedIn: 'root' })
export class HeaderService {
  private readonly REVERSE_GEOCODING_API = 'https://nominatim.openstreetmap.org/reverse';
  private readonly http = inject(HttpClient);

  readonly userLocationCords = signal<LocationCoords | null>(null);
  readonly userLocationName = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /**
   * Observable method to get user location.
   * Subscribed to from the header component.
   */
  getUserLocation(request: LocationCoords): Observable<any> {
      const params = {
            format: 'json',
            lat: request.lat.toString(),
            lon: request.long.toString(),
            zoom: '10'
      };
    return this.http.get<any>(this.REVERSE_GEOCODING_API, { params });
  }  
}
