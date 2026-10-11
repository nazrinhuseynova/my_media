import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { postApi } from "../../../features/post/services/postApi";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import PostCard from "../../../features/post/components/PostCard";
import CommentPanel from "../../../features/post/components/CommentPanel";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Icon from "../../../components/ui/Icon";

export default function PostPage() {
  const { id } = useParams();
  const me = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [edit, setEdit] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    const data = await postApi.one(id);
    setPost(data);
    setEdit(data.caption || "");
  }

  useEffect(() => {
    load();
  }, [id]);

  function goBack() {
    const idx = window.history.state?.idx;
    if (typeof idx === "number" && idx > 0) navigate(-1);
    else navigate("/");
  }

  if (!post) return <div className="page"><div className="spinner" /></div>;

  const mine = me?.id === post.userId;

  return (
    <div className="page post-page">
      <div className="post-page-head">
        <button type="button" className="reels-back" onClick={goBack}>
          <Icon name="back" size={22} />
          <span>Geri</span>
        </button>
        {mine ? (
          <div className="row">
            <Button variant="ghost" type="button" onClick={() => setEditing((v) => !v)}>Redaktə</Button>
            <Button variant="ghost" type="button" onClick={async () => { await postApi.pin(post.id); load(); }}>{post.isPinned ? "Sabitdən çıxar" : "Sabitlə"}</Button>
            <Button variant="ghost" type="button" onClick={async () => { await postApi.archive(post.id); navigate("/"); }}>{post.isArchived ? "Arxivdən çıxar" : "Arxiv"}</Button>
            <Button variant="danger" type="button" onClick={async () => { await postApi.remove(post.id); navigate("/"); }}>Sil</Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            type="button"
            onClick={async () => {
              await api.post("/api/reports", { targetType: "post", targetId: post.id, reason: "Uyğunsuz kontent" });
              setNote("Şikayət göndərildi");
            }}
          >
            Şikayət et
          </Button>
        )}
      </div>
      {note ? <p className="success-text">{note}</p> : null}
      {editing ? (
        <div className="post-edit">
          <Input value={edit} onChange={(e) => setEdit(e.target.value)} label="Caption" />
          <Button type="button" onClick={async () => { await postApi.update(post.id, { caption: edit }); setEditing(false); load(); }}>Yadda saxla</Button>
          {post.scheduledAt ? <Button variant="ghost" type="button" onClick={async () => { await postApi.update(post.id, { clearSchedule: true }); load(); }}>Planı ləğv et</Button> : null}
        </div>
      ) : null}
      <div className="post-detail">
        <PostCard post={post} onChange={setPost} layout="detail" />
        <aside id="post-comments" className="post-comments-col">
          <h3>Şərhlər</h3>
          <CommentPanel
            postId={post.id}
            comments={post.comments || []}
            onChange={(next) => setPost({ ...post, comments: next, commentCount: next.length })}
          />
        </aside>
      </div>
    </div>
  );
}
