// Environment configuration for Production

const LOCAL_BACKEND_URL = 'https://reimagined-spork-qgxj766qqvjfx97j-3000.app.github.dev';

export const environment = {
    production: true,
    baseUrl: LOCAL_BACKEND_URL,
    graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};
