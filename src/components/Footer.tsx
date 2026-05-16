import React from "react";
import { Link, useLocation } from "react-router-dom";
const Footer = () => {
  const location = useLocation();
  return <footer className="text-center space-y-4 text-muted-foreground text-sm">
      <p>Developed by Saabir</p>
      <Link to="/privacy-policy" state={{ from: location.pathname }} className="text-primary hover:text-accent transition-colors underline">
        Secure privacy policy   
      </Link>
    </footer>;
};
export default Footer;