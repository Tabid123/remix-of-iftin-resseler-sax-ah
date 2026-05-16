interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Phone verification & offline registration removed — open access.
const ProtectedRoute = ({ children }: ProtectedRouteProps) => <>{children}</>;

export default ProtectedRoute;
