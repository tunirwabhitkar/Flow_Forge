import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../auth/middleware.js';
import { aiAssistantService } from '../../ai-assistant/ai-assistant.service.js';

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI rate limit exceeded. Please wait before sending more requests.' },
});

export function createAIRouter(): Router {
  const r = Router();
  r.use(authenticate);
  r.use(aiLimiter);

  r.post('/generate-nodes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        description: z.string().min(5).max(1000),
        existingNodes: z.array(z.string()).optional(),
        context: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const result = await aiAssistantService.generateNodes(body);
      res.json(result);
    } catch (err) { next(err); }
  });

  r.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
        })).min(1).max(20),
        workflowContext: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const reply = await aiAssistantService.chat(body.messages, body.workflowContext);
      res.json({ reply });
    } catch (err) { next(err); }
  });

  return r;
}
