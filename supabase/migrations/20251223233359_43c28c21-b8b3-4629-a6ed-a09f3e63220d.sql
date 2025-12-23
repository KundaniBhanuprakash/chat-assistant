-- Allow users to update messages in their conversations
CREATE POLICY "Users can update messages in their conversations" 
ON public.messages FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = messages.conversation_id AND user_id = auth.uid()
  )
);

-- Allow users to delete messages in their conversations
CREATE POLICY "Users can delete messages in their conversations" 
ON public.messages FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = messages.conversation_id AND user_id = auth.uid()
  )
);