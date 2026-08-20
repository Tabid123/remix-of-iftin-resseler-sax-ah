import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, ChevronRight, ChevronLeft, TrendingUp, FileDown, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { formatPrice } from '@/lib/utils';
import { exportTransactionsPDF, exportTransactionsExcel } from '@/utils/analyticsExporter';

interface Transaction {
  id: string;
  customer_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  status: string;
  delivery_status?: string;
  created_at: string;
  package_id: string;
  provider_id: string;
  cost_price: number;
  evoucher_rate: number;
  sender_phone?: string;
  receiver_phone?: string;
  provider_name: string;
}

const PAGE_SIZE = 50;

const calculateProfit = (sellingPrice: number, costPrice: number, evoucherRate: number): number => {
  const commission = sellingPrice * evoucherRate;
  const totalReceived = sellingPrice + commission;
  return totalReceived - costPrice;
};

export function TransactionsDashboard() {
  const { language } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // Stats from summary RPC
  const [statsData, setStatsData] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('today');
  const [providerFilter, setProviderFilter] = useState('all');

  // Providers list for filter dropdown
  const [providers, setProviders] = useState<{id: string; name: string}[]>([]);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load providers once
  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('display_order');
      if (data) {
        setProviders(data.map(p => ({ id: p.id, name: p.provider_name })));
      }
    };
    loadProviders();
  }, []);

  // Load summary stats
  const loadStats = useCallback(async () => {
    const provId = providerFilter === 'all' ? null : providerFilter;
    const { data } = await supabase.rpc('get_admin_transactions_summary', {
      p_provider_id: provId,
      p_period: periodFilter,
    });
    if (data) setStatsData(data as any);
  }, [providerFilter, periodFilter]);

  // Load paginated transactions
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_transactions_paginated', {
      p_search: debouncedSearch,
      p_status: statusFilter,
      p_provider_id: providerFilter,
      p_period: periodFilter,
      p_limit: PAGE_SIZE,
      p_offset: currentPage * PAGE_SIZE,
    });

    if (!error && data) {
      const result = data as any;
      setTransactions(result.rows || []);
      setTotalCount(result.total_count || 0);
      setTotalSales(result.total_sales || 0);
      setTotalProfit(result.total_profit || 0);
    }
    setLoading(false);
  }, [debouncedSearch, statusFilter, providerFilter, periodFilter, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearch, statusFilter, providerFilter, periodFilter]);

  useEffect(() => {
    loadTransactions();
    loadStats();
  }, [loadTransactions, loadStats]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return <Badge className="bg-green-500 hover:bg-green-600">Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-500 hover:bg-red-600">Failed</Badge>;
      case 'timeout':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Timeout - Verify</Badge>;
      case 'pending':
      case 'queued':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>;
      case 'payment_confirmed':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Confirmed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleManualVerify = async (orderId: string) => {
    try {
      await supabase
        .from('orders')
        .update({
          delivery_status: 'delivered',
          delivery_notes: 'Manually verified by admin',
          delivered_at: new Date().toISOString()
        })
        .eq('id', orderId);
      loadTransactions();
    } catch (error) {
      console.error('Manual verify error:', error);
    }
  };

  const sToday = statsData?.transactions_today ?? 0;
  const sSalesToday = statsData?.sales_today ?? 0;
  const sSalesMonth = statsData?.sales_this_month ?? 0;
  const sProfit = statsData?.total_profit ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-500 text-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col h-full">
              <p className="text-sm text-blue-100 font-medium">Transactions Today</p>
              <p className="text-4xl font-bold mt-2">{sToday}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-blue-400">
                <span className="text-sm text-blue-100">View Details</span>
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-600 text-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col h-full">
              <p className="text-sm text-purple-100 font-medium">Sales Today</p>
              <p className="text-4xl font-bold mt-2">${Number(sSalesToday).toFixed(2)}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-purple-400">
                <span className="text-sm text-purple-100">View Details</span>
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-600 text-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col h-full">
              <p className="text-sm text-gray-300 font-medium">Sales This Month</p>
              <p className="text-4xl font-bold mt-2">${Number(sSalesMonth).toFixed(2)}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-500">
                <span className="text-sm text-gray-300">View Details</span>
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-500 text-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col h-full">
              <p className="text-sm text-emerald-100 font-medium">
                {periodFilter === 'today' ? "Today's" : periodFilter === 'yesterday' ? "Yesterday's" : periodFilter === 'week' ? "Week's" : periodFilter === 'month' ? "Month's" : periodFilter === 'year' ? "Year's" : 'Total'} Profit
              </p>
              <p className="text-4xl font-bold mt-2">${Number(sProfit).toFixed(2)}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-emerald-400">
                <span className="text-sm text-emerald-100">View Details</span>
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'so' ? 'Raadi Phone/ID...' : 'Search by Phone/ID...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportTransactionsPDF(transactions, {
            totalCount, totalSales, totalProfit,
            period: periodFilter === 'today' ? 'Today' : periodFilter === 'yesterday' ? 'Yesterday' : periodFilter === 'week' ? 'This Week' : periodFilter === 'month' ? 'This Month' : periodFilter === 'year' ? 'This Year' : 'All Time'
          })}
          disabled={transactions.length === 0}
        >
          <FileDown className="h-4 w-4 mr-1" /> PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportTransactionsExcel(transactions, {
            totalCount, totalSales, totalProfit,
            period: periodFilter === 'today' ? 'Today' : periodFilter === 'yesterday' ? 'Yesterday' : periodFilter === 'week' ? 'This Week' : periodFilter === 'month' ? 'This Month' : periodFilter === 'year' ? 'This Year' : 'All Time'
          })}
          disabled={transactions.length === 0}
        >
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
        </Button>
      </div>

      {/* Transactions Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="mobile-table">
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-blue-600 to-purple-600">
                  <TableHead className="text-white font-semibold">TranId</TableHead>
                  <TableHead className="text-white font-semibold">Time</TableHead>
                  <TableHead className="text-white font-semibold">Description</TableHead>
                  <TableHead className="text-white font-semibold text-right">Selling</TableHead>
                  <TableHead className="text-white font-semibold text-right">Cost</TableHead>
                  <TableHead className="text-white font-semibold text-right">Profit</TableHead>
                  <TableHead className="text-white font-semibold">Provider</TableHead>
                  <TableHead className="text-white font-semibold">Sender</TableHead>
                  <TableHead className="text-white font-semibold">Receiver</TableHead>
                  <TableHead className="text-white font-semibold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {language === 'so' ? 'Wax transaction ah lama helin' : 'No transactions found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((t, index) => {
                    const profit = calculateProfit(t.selling_price, t.cost_price || 0, t.evoucher_rate || 0);
                    const isPositiveProfit = profit > 0;

                    return (
                      <TableRow key={t.id} className={index % 2 === 0 ? 'bg-muted/30' : ''}>
                        <TableCell data-label="TranId" className="font-mono text-sm">
                          {t.id.substring(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell data-label="Time" className="text-sm whitespace-nowrap">
                          {format(new Date(t.created_at), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell data-label="Description">
                          <div className="max-w-48">
                            <p className="font-medium truncate">{t.package_name}</p>
                            <p className="text-xs text-muted-foreground">{t.data_amount}</p>
                          </div>
                        </TableCell>
                        <TableCell data-label="Selling" className="text-right font-medium">
                          ${Number(t.selling_price).toFixed(2)}
                        </TableCell>
                        <TableCell data-label="Cost" className="text-right text-muted-foreground">
                          ${Number(t.cost_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell data-label="Profit" className={`text-right font-semibold ${isPositiveProfit ? 'text-green-600' : 'text-red-600'}`}>
                          {isPositiveProfit ? '+' : ''}${formatPrice(profit)}
                        </TableCell>
                        <TableCell data-label="Provider" className="font-medium">
                          {t.provider_name}
                        </TableCell>
                        <TableCell data-label="Sender" className="font-mono text-sm">
                          {(t.sender_phone || t.customer_phone || '').replace('+252', '')}
                        </TableCell>
                        <TableCell data-label="Receiver" className="font-mono text-sm">
                          {t.receiver_phone?.replace('+252', '') || '-'}
                        </TableCell>
                        <TableCell data-label="Status" className="text-center flex items-center gap-2 justify-center">
                          {getStatusBadge(t.delivery_status || t.status)}
                          {t.delivery_status === 'timeout' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2 h-6 px-2 text-xs"
                              onClick={() => handleManualVerify(t.id)}
                            >
                              ✓ Xaqiiji
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer Summary + Pagination */}
        {!loading && (
          <div className="border-t p-4 bg-muted/30">
            <div className="flex flex-wrap justify-between gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total: </span>
                <span className="font-bold">{totalCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sales: </span>
                <span className="font-bold text-blue-600">${Number(totalSales).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Profit: </span>
                <span className="font-bold text-green-600">${Number(totalProfit).toFixed(2)}</span>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-4">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
