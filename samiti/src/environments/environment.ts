const LOCAL_BACKEND_URL = 'http://localhost:3001';
// const LOCAL_BACKEND_URL = 'https://refactored-giggle-gwpj466q7q93wj4j-3000.app.github.dev';


export const environment = {
  production: false,
  baseUrl: LOCAL_BACKEND_URL,
  graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};