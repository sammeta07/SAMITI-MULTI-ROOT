export interface LocationCoords {
  lat: number;
  long: number;
}
export interface LoginResponseData {
  userId: number;
  name: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  baseRole: string;
  committees: any[];
  photo: string;
}
