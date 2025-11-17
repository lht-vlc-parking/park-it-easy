import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Calendar, Car, Bike } from "lucide-react";

interface Booking {
  id: string;
  date: string;
  duration: "morning" | "afternoon" | "full";
  vehicleType: "car" | "motorcycle";
  userName: string;
  spotNumber: number;
}

interface StatisticsCardProps {
  bookings: Booking[];
}

export const StatisticsCard = ({ bookings }: StatisticsCardProps) => {
  const today = new Date();
  const thisWeekStart = new Date(today.setDate(today.getDate() - today.getDay()));
  const thisWeekEnd = new Date(today.setDate(today.getDate() - today.getDay() + 6));

  const thisWeekBookings = bookings.filter(b => {
    const bookingDate = new Date(b.date);
    return bookingDate >= thisWeekStart && bookingDate <= thisWeekEnd;
  });

  const carBookings = bookings.filter(b => b.vehicleType === "car").length;
  const motorcycleBookings = bookings.filter(b => b.vehicleType === "motorcycle").length;
  const totalBookings = bookings.length;

  const stats = [
    {
      title: "Total Bookings",
      value: totalBookings,
      icon: Calendar,
      gradient: "bg-gradient-primary"
    },
    {
      title: "This Week",
      value: thisWeekBookings.length,
      icon: TrendingUp,
      gradient: "bg-gradient-success"
    },
    {
      title: "Car Bookings",
      value: carBookings,
      icon: Car,
      gradient: "bg-gradient-accent"
    },
    {
      title: "Motorcycle Bookings",
      value: motorcycleBookings,
      icon: Bike,
      gradient: "bg-gradient-accent"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="overflow-hidden transition-smooth hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className={`p-3 rounded-lg ${stat.gradient}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
