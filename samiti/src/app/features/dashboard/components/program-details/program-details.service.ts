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
        programName
        programBanner
        bannerImages
        address
        status
        visibility
        startDate
        endDate
        createdBy
        updatedBy
        createdAt
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
}
