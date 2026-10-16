// Environment configuration for Production

const LOCAL_BACKEND_URL = 'http://localhost:3000';

export const environment = {
    production: true,
    baseUrl: LOCAL_BACKEND_URL,
    graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};
