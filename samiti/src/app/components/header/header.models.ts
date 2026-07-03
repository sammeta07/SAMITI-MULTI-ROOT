export interface LocationCoords {
  lat: number;
  long: number;
}
export interface LoginResponseData {
  id: number;
  name: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  baseRole: string[];
  committees: any[];
  events?: any[];
  dashboardTree?: any[];
  photo: string;
}
