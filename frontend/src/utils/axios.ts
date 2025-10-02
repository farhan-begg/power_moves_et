import axios from "axios";

// const instance = axios.create({
//   baseURL: "https://power-moves-et.onrender.com/api",
// });

 const instance = axios.create({
   baseURL: "http://localhost:5000/api",
 });
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default instance;
