// Environment configuration for Production

const LOCAL_BACKEND_URL = 'https://fluffy-goggles-p79w6wq94qgjcrj6w-3000.app.github.dev';

export const environment = {
    production: true,
    baseUrl: LOCAL_BACKEND_URL,
    graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};