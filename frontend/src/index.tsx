import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Provider } from 'react-redux';
import { store } from './app/store';
import './styles/index.css'


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
const queryClient = new QueryClient();
root.render(

  <Provider store={store}>
      <QueryClientProvider client={queryClient}>

    <App />
            
      </QueryClientProvider>
 </Provider>
);

