import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../app/store";
import { setFilters } from "../features/transactions/transactionSlice";
import PlaidLinkButton from "../components/PlaidLinkButton";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidTransactions, fetchPlaidAccounts } from "../api/plaid";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useSelector((state: RootState) => state.auth);
  const { filters, pages } = useSelector((state: RootState) => state.transactions);

  const [plaidLinked, setPlaidLinked] = useState(true);

  // ✅ React Query - Transactions
  const {
    data: transactions,
    isLoading: loadingTxns,
    isError: errorTxns,
  } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => fetchPlaidTransactions(token!),
    enabled: !!token,
  });

  // ✅ React Query - Accounts
  const {
    data: accounts,
    isLoading: loadingAccounts,
    isError: errorAccounts,
  } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
  });

  // ✅ Check Plaid access
  useEffect(() => {
    const checkPlaidStatus = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPlaidLinked(!!res.data.plaidAccessToken);
      } catch (err) {
        console.error("Plaid check failed", err);
        setPlaidLinked(false);
      }
    };

    if (token) checkPlaidStatus();
  }, [token]);

  // ✅ Handle pagination
  const handlePageChange = (newPage: number) => {
    dispatch(setFilters({ page: newPage }));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {/* 💳 Show Plaid connect option if not linked */}
      {!plaidLinked && (
        <div className="mb-6 bg-slate-800 p-4 rounded-lg shadow">
          <p className="mb-2">You haven't connected your bank yet:</p>
          <PlaidLinkButton />
        </div>
      )}

      {/* 🏦 Bank Accounts */}
      {accounts && (
        <div className="mb-6 bg-slate-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Linked Bank Accounts</h2>
          {accounts.map((acc: any) => (
            <div key={acc.account_id} className="mb-3">
              <p className="font-bold">{acc.name} ({acc.subtype})</p>
              <p>Available: ${acc.balances.available ?? "N/A"}</p>
            </div>
          ))}
        </div>
      )}

      {/* 📊 Transactions */}
      {loadingTxns && <p>Loading transactions...</p>}
      {errorTxns && <p>Error loading transactions</p>}

      {transactions && (
        <>
          <ul className="space-y-4">
            {transactions.map((txn: any) => (
              <li key={txn._id} className="bg-slate-800 p-4 rounded-lg shadow">
                <p className="font-semibold">{txn.description}</p>
                <p>{txn.category} • {txn.type}</p>
                <p>${txn.amount}</p>
                <p className="text-sm text-gray-400">{new Date(txn.date).toLocaleDateString()}</p>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    txn.source === "plaid" ? "bg-green-600" : "bg-blue-600"
                  }`}
                >
                  {txn.source}
                </span>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              disabled={filters.page <= 1}
              onClick={() => handlePageChange(filters.page - 1)}
              className="bg-gray-700 px-4 py-2 rounded disabled:opacity-50"
            >
              Prev
            </button>
            <p>Page {filters.page} of {pages}</p>
            <button
              disabled={filters.page >= pages}
              onClick={() => handlePageChange(filters.page + 1)}
              className="bg-gray-700 px-4 py-2 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
