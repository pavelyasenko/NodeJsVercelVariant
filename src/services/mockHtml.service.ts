import { FALLBACK_IMAGE } from "./imagePlaceholders.service.js";

export const MOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Sushi Landing</title>
</head>
<body class="min-h-screen w-full bg-slate-950 text-white">
  <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
    <img
      src="${FALLBACK_IMAGE}"
      alt="Generated preview"
      class="mb-10 h-72 w-full rounded-3xl object-cover shadow-2xl"
    />
    <h1 class="mb-6 text-4xl font-bold sm:text-6xl">Delicious Sushi in Odesa</h1>
    <p class="mb-8 max-w-2xl text-lg font-light text-slate-300 sm:text-xl">
      Fresh ingredients, fast delivery, and careful attention to every order.
    </p>
    <button
      type="button"
      class="rounded-xl bg-red-600 px-7 py-4 font-semibold text-white transition hover:bg-red-700"
    >
      Order now
    </button>
  </main>
</body>
</html>`;