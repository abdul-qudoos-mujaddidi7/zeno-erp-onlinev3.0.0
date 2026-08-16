import { wrap } from 'svelte-spa-router/wrap';
import RouteLoading from './components/RouteLoading.svelte';

function lazy(loader) {
  return wrap({
    asyncComponent: loader,
    loadingComponent: RouteLoading,
  });
}

export default {
  '/': lazy(() => import('./layouts/Home.svelte')),
  '/login': lazy(() => import('./auth/Login.svelte')),
  '/register': lazy(() => import('./auth/Register.svelte')),
  '/dashboard': lazy(() => import('./layouts/DashboardLayout.svelte')),
  '/video': lazy(() => import('./layouts/Home.svelte')),
  '/pos': lazy(() => import('./pages/POS.svelte')),
  '/dashboard/*': lazy(() => import('./layouts/DashboardLayout.svelte')),
};
