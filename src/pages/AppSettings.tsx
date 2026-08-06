import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Type, RotateCcw } from "lucide-react";
import {
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  useAppearance,
} from "@/hooks/useAppearance";

export default function AppSettings() {
  const { fontFamily, fontSize, setFontFamily, setFontSize, reset } = useAppearance();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 max-w-2xl mx-auto"
    >
      <div>
        <h1 className="text-xl font-bold">App Settings</h1>
        <p className="text-sm text-muted-foreground">
          Personalise how the app looks on this device.
        </p>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="h-4 w-4 text-primary" />
            Typography
          </CardTitle>
          <CardDescription>
            Font and size apply across every module, screen and field.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Font family</Label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger>
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.label} value={f.stack}>
                    <span style={{ fontFamily: f.stack }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Font size</Label>
            <Select
              value={String(fontSize)}
              onValueChange={(v) => setFontSize(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a size" />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    <span style={{ fontSize: `${s}px` }}>{s} pt</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <p className="font-semibold">Bharath Builders — Field Force</p>
            <p className="text-sm">
              The quick brown fox jumps over the lazy dog. 0123456789 ₹1,24,500
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
