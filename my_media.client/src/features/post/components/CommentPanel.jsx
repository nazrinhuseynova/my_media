import { postApi } from "../services/postApi";
import CommentThread from "../../comment/CommentThread";

export default function CommentPanel({ postId, comments, onChange, onPosted }) {
  return (
    <CommentThread
      comments={comments}
      onChange={onChange}
      submit={async ({ text, parentId }) => {
        const created = await postApi.comment(postId, { text, parentId });
        onPosted?.();
        return created;
      }}
      react={(comment, type) => postApi.reactComment(comment.id, type)}
      edit={(comment, text) => postApi.editComment(comment.id, text)}
      remove={(comment) => postApi.deleteComment(comment.id)}
    />
  );
}
