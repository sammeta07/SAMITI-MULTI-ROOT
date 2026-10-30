import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { ProgramDetailsPayload } from './program-details.models';

export interface UploadProgramBannerImagesPayload {
  programId: number;
  bannerImages: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ProgramDetailsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getProgramDetails(id: string): Observable<ProgramDetailsPayload> {
    const query = `query {
      programDetails(id: ${id}) {
        id
        programId
        eventId
        parentProgramId
        parentProgramName
        programName
        programBanner
        bannerImages
        address
        visibility
        startDate
        endDate
        startTime
        endTime
        createdBy
        createdByName
        updatedBy
        updatedByName
        createdAt
        ownerUserId
        ownerName
        ownerDesignation
        ownerDesignationColor
        ownerDesignationIcon
        ownerAssignedBy
        ownerAssignedAt
        canAssignOwner
        todos {
          id
          title
          status
          isCompleted
          assignedUserId
          assignedUserName
          createdAt
        }
        todoAssignees {
          userId
          name
        }
        canManageTodos
        canToggleTodos
        canCreateSubprogram
        subprograms {
          programId
          programName
          startDate
          endDate
          visibility
        }
        price
      }
    }`;

    return this.http.post<{ data: { programDetails: ProgramDetailsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.programDetails)
    );
  }

  public uploadProgramBannerImages(programId: number, bannerImageUrls: string[]): Observable<UploadProgramBannerImagesPayload> {
    const mutation = `mutation UploadProgramBannerImages($programId: Int!, $bannerImageUrls: [String!]!) {
      uploadProgramBannerImages(programId: $programId, bannerImageUrls: $bannerImageUrls) {
        programId
        bannerImages
      }
    }`;

    return this.http.post<{ data: { uploadProgramBannerImages: UploadProgramBannerImagesPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { programId, bannerImageUrls } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.uploadProgramBannerImages)
    );
  }

  public deleteProgramBannerImage(programId: number, mediaUrl: string): Observable<UploadProgramBannerImagesPayload> {
    const mutation = `mutation DeleteProgramBannerImage($programId: Int!, $mediaUrl: String!) {
      deleteProgramBannerImage(programId: $programId, mediaUrl: $mediaUrl) {
        programId
        bannerImages
      }
    }`;

    return this.http.post<{ data: { deleteProgramBannerImage: UploadProgramBannerImagesPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { programId, mediaUrl } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.deleteProgramBannerImage)
    );
  }

  public deleteProgram(programId: number): Observable<boolean> {
    const mutation = `mutation DeleteProgram($programId: Int!) {
      deleteProgram(programId: $programId)
    }`;

    return this.http.post<{ data: { deleteProgram: boolean } }>(
      this.graphqlUrl,
      { query: mutation, variables: { programId } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.deleteProgram)
    );
  }

  public updateProgramVisibility(
    program: ProgramDetailsPayload,
    visibility: 'VISIBLE' | 'HIDDEN'
  ): Observable<'VISIBLE' | 'HIDDEN'> {
    if (
      !program.eventId ||
      !program.startDate ||
      !program.endDate ||
      !program.startTime ||
      !program.endTime
    ) {
      throw new Error('Program details are incomplete; visibility cannot be updated.');
    }

    const mutation = `mutation UpdateProgramVisibility($input: UpdateProgramInput!) {
      updateProgram(input: $input) {
        visibility
      }
    }`;

    return this.http.post<{
      data?: { updateProgram?: { visibility: 'VISIBLE' | 'HIDDEN' } | null };
      errors?: Array<{ message: string }>;
    }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          input: {
            programId: program.programId,
            eventId: program.eventId,
            programName: program.programName,
            address: program.address || '',
            visibility,
            startDate: program.startDate,
            endDate: program.endDate,
            startTime: program.startTime,
            endTime: program.endTime,
            price: program.price
          }
        }
      },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const updatedVisibility = response.data?.updateProgram?.visibility;
        if (updatedVisibility !== 'VISIBLE' && updatedVisibility !== 'HIDDEN') {
          throw new Error('GraphQL response is missing updated program visibility.');
        }
        return updatedVisibility;
      })
    );
  }
}