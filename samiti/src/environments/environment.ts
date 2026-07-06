const LOCAL_BACKEND_URL = 'http://localhost:3001';

export const environment = {
  production: false,
  baseUrl: LOCAL_BACKEND_URL,
  graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};