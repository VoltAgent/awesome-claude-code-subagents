import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Eye, Code, FileText } from "lucide-react";

export const CodePreview = () => {
  const files = [
    {
      name: "auth.ts",
      language: "typescript",
      code: `import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const authenticate = async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};`,
      agent: "Implementation",
      status: "modified",
    },
    {
      name: "auth.test.ts",
      language: "typescript",
      code: `import { authenticate } from './auth';
import { Request, Response } from 'express';

describe('Authentication', () => {
  it('should reject requests without token', async () => {
    const req = { headers: {} } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;
    
    await authenticate(req, res);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ 
      error: 'No token provided' 
    });
  });
});`,
      agent: "Testing",
      status: "new",
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Live Code Preview
          </CardTitle>
          <CardDescription>Real-time view of generated code</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={files[0].name}>
            <TabsList className="grid w-full grid-cols-2">
              {files.map((file) => (
                <TabsTrigger key={file.name} value={file.name} className="gap-2">
                  <Code className="w-3 h-3" />
                  {file.name}
                  <Badge
                    variant={file.status === "new" ? "default" : "secondary"}
                    className="text-xs ml-2"
                  >
                    {file.status}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {files.map((file) => (
              <TabsContent key={file.name} value={file.name} className="mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{file.language}</Badge>
                    <Badge variant="outline">Agent: {file.agent}</Badge>
                  </div>

                  <ScrollArea className="h-[500px] w-full">
                    <pre className="p-4 rounded-lg bg-muted/50 text-sm font-mono">
                      <code>{file.code}</code>
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
