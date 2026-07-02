export interface LocationCoords {
  lat: number;
  long: number;
}
export interface LoginResponseData {
  user_id: number;
  name: string;
  email: string;
  mobile: string;
  date_of_birth: string;
  gender: string;
  base_role: string;
  committees: any[];
  photo: string;
}
