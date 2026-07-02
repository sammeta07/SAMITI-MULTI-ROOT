const LOCAL_BACKEND_URL = 'http://localhost:3000';
const CLOUD_BACKEND_URL = 'https://refactored-giggle-gwpj466q7q93wj4j-3000.app.github.dev';

const isCloudRuntime = typeof window !== 'undefined' && window.location.hostname.includes('github.dev');
const activeBackendUrl = isCloudRuntime ? CLOUD_BACKEND_URL : LOCAL_BACKEND_URL;

export const environment = {
  production: false,
  baseUrl: activeBackendUrl,
  graphqlUrl: `${activeBackendUrl}/graphql`
};