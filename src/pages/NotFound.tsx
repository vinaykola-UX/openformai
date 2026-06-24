import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="grid flex-1 place-items-center px-4">
        <div className="text-center">
          <p className="font-display text-7xl font-bold text-brand">404</p>
          <h1 className="mt-4 font-display text-2xl font-bold">Page not found</h1>
          <Link to="/" className="btn-primary mt-6">Back home</Link>
        </div>
      </main>
    </div>
  );
}
