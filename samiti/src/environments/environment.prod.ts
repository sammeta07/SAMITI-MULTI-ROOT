// Environment configuration for Production

const LOCAL_BACKEND_URL = 'https://psychic-goggles-vpwrx465rw5ghx6xq-3000.app.github.dev';

export const environment = {
    production: true,
    baseUrl: LOCAL_BACKEND_URL,
    graphqlUrl: `${LOCAL_BACKEND_URL}/graphql`
};
