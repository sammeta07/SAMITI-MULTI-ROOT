// Environment configuration for Production

const LOCAL_BACKEND_URL = 'https://solid-parakeet-77pj9pw45xrxfv5j-3001.app.github.dev';

export const environment = {
    production: true,
    baseUrl: LOCAL_BACKEND_URL,
    graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};
