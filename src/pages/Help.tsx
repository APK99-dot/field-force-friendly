import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Mail, Phone, LifeBuoy, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

const FAQS = [
  {
    q: "How do I mark attendance?",
    a: "Open Attendance from the menu and tap Check In. Allow location and camera access — a selfie and GPS point are captured to validate your check-in. Tap Check Out at the end of your day.",
  },
  {
    q: "My location or camera isn't working",
    a: "Enable Location and Camera permissions for the app in your device settings, then reopen the app. On iPhone, install the app to your Home Screen for best results.",
  },
  {
    q: "How do I raise an expense or a requisition?",
    a: "Expenses are submitted from the Expenses module; procurement requisitions from the Procurement module using New Requisition. Both then follow the approval workflow configured by your admin.",
  },
  {
    q: "How do I apply for leave?",
    a: "Go to Attendance and use Apply Leave. Your available balance is shown per leave type, and the request is routed to your reporting manager.",
  },
  {
    q: "I can't see a module in the menu",
    a: "Modules are shown based on your security profile. Contact your administrator to request access.",
  },
  {
    q: "How do I change the app font or text size?",
    a: "Open Account → App Settings and choose a font family and size. The change applies across every screen on this device.",
  },
];

export default function Help() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 max-w-2xl mx-auto"
    >
      <div>
        <h1 className="text-xl font-bold">Help &amp; Support</h1>
        <p className="text-sm text-muted-foreground">
          Answers to common questions, and how to reach us.
        </p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0 divide-y divide-border">
          <a
            href="mailto:support@bharathbuilders.com?subject=Field%20Force%20App%20Support"
            className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Email support</p>
              <p className="text-xs text-muted-foreground">
                support@bharathbuilders.com
              </p>
            </div>
          </a>
          <a
            href="tel:+919000000000"
            className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Phone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Call the helpdesk</p>
              <p className="text-xs text-muted-foreground">
                Mon–Sat, 9:00 AM – 6:00 PM IST
              </p>
            </div>
          </a>
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">App Settings</p>
              <p className="text-xs text-muted-foreground">
                Change font and text size
              </p>
            </div>
          </button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <LifeBuoy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Frequently asked questions</h2>
          </div>
          <Accordion type="single" collapsible>
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-sm text-left">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground py-2">
        Bharath Builders v1.0 • Field Force Management
      </p>
    </motion.div>
  );
}
