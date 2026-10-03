import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable, catchError } from 'rxjs';
import { EventVotingService } from '../../features/dashboard/components/event-details/event-voting/event-voting.service';

/**
 * VotingPhaseGuard
 *
 * Protects the `/dashboard/event/:id/voting` child route.
 * When the event's voting phase has reached the results stage
 * (votingPhaseState === 6), the guard redirects the user to the
 * `/dashboard/event/:id/overview` route instead of letting them
 * view the voting UI.
 *
 * This runs automatically whenever the user navigates to the voting
 * route — whether by clicking an event card or by typing the URL
 * directly into the address bar.
 */
export const votingPhaseGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const votingService = inject(EventVotingService);

  const eventId = route.pathFromRoot
    .map((routeSnapshot) => routeSnapshot.paramMap.get('id'))
    .find((id) => id !== null);
  if (!eventId) {
    return false;
  }

  const redirectUrlTree: UrlTree = router.createUrlTree(
    ['/dashboard/event', eventId, 'overview']
  );

  return votingService.getEventVotingDetails(eventId).pipe(
    map((data) => {
      const phase = Number(data?.votingPhaseState || 0);
      // Phase 6 = results declared → block voting route, redirect to overview
      return phase === 6 ? redirectUrlTree : true;
    }),
    catchError(() => {
      // If the phase cannot be read, allow access to the voting route
      // rather than stranding the user on a blank page.
      return new Observable<boolean>((observer) => {
        observer.next(true);
        observer.complete();
      });
    })
  );
};