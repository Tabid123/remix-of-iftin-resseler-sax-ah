import { Navigate, useSearchParams } from 'react-router-dom';
import Landing from '@/pages/Landing';

/**
 * Root route: `/?t=<slug>` is a reseller storefront link — send the visitor
 * straight into that tenant's shop. Plain `/` shows the marketing landing page.
 */
const RootRoute = () => {
  const [params] = useSearchParams();
  const slug = params.get('t')?.trim();

  if (slug) {
    return <Navigate to={`/providers?t=${encodeURIComponent(slug)}`} replace />;
  }

  return <Landing />;
};

export default RootRoute;
