import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <p className="text-6xl font-bold text-primary-600">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-gray-900">
        Pagina niet gevonden
      </h1>
      <p className="mt-2 max-w-md text-gray-600">
        De pagina die u zoekt bestaat niet of is verplaatst.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
      >
        Terug naar dashboard
      </Link>
    </div>
  );
}
