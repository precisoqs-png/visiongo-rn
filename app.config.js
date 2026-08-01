// app.json stays the source of truth for the existing static GitHub Pages
// export (web.output: "single", baseUrl: "/visiongo-rn"). This file lets a
// Vercel build opt into server output — which is what makes app/api/*
// routes run as real serverless functions instead of being silently
// dropped from a static export — without touching the GH Pages path at all.
module.exports = ({ config }) => {
  if (process.env.EXPO_WEB_OUTPUT !== 'server') {
    return config;
  }

  const { baseUrl, ...restExperiments } = config.experiments ?? {};
  return {
    ...config,
    web: { ...config.web, output: 'server' },
    experiments: restExperiments,
  };
};
