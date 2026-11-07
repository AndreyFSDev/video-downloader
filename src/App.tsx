import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MainLayout } from "./components/MainLayout";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout />
    </QueryClientProvider>
  );
}

export default App;
