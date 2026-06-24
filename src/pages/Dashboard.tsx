import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border p-6 shadow-sm">
            <h1 className="text-3xl font-bold">
              Dashboard Working ✅
            </h1>

            <div className="mt-6 space-y-3">
              <p>
                <strong>User UID:</strong>{" "}
                {user?.uid || "Not Found"}
              </p>

              <p>
                <strong>Email:</strong>{" "}
                {user?.email || "Not Found"}
              </p>

              <p>
                <strong>Name:</strong>{" "}
                {user?.displayName || "No Name"}
              </p>
            </div>

            <div className="mt-8 flex gap-3">
              <Link
                to="/dashboard/new"
                className="rounded-xl bg-red-700 px-5 py-3 text-white"
              >
                Create Form
              </Link>

              <Link
                to="/connect-google"
                className="rounded-xl border px-5 py-3"
              >
                Connect Google
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}